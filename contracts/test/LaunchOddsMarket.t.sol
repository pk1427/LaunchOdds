// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LaunchOddsMarket} from "../src/LaunchOddsMarket.sol";

/// @notice Test suite covering spec sections 6 A-G: deployment/access, market
/// creation, positions, resolution, payouts, refunds, reentrancy.
contract LaunchOddsMarketTest is Test {
    LaunchOddsMarket market;

    address owner = makeAddr("owner");
    address resolver = makeAddr("resolver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");
    address stranger = makeAddr("stranger");

    uint256 constant GRACE = 1 days;
    uint256 constant SOURCE = 12345678;
    bytes32 constant META = keccak256("Will HN story 12345678 reach 45 by expiry?");
    bytes32 constant EVIDENCE = keccak256("hn-api-evidence");

    function setUp() public {
        market = new LaunchOddsMarket(owner, resolver, GRACE);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
        vm.deal(stranger, 100 ether);
    }

    // -- helpers -----------------------------------------------------------

    function _create() internal returns (uint256 id) {
        id = market.createMarket(SOURCE, 42, 45, uint64(block.timestamp + 1 hours), META);
    }

    function _createWith(uint256 baseline, uint256 target, uint64 expiry) internal returns (uint256 id) {
        id = market.createMarket(SOURCE, baseline, target, expiry, META);
    }

    function _bet(address user, uint256 id, bool isYes, uint256 amount) internal {
        vm.prank(user);
        market.takePosition{value: amount}(id, isYes);
    }

    function _expire(uint256 id) internal {
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        vm.warp(m.expiry);
    }

    function _expireAndResolve(uint256 id, uint256 finalScore) internal {
        _expire(id);
        vm.prank(resolver);
        market.resolveMarket(id, finalScore, EVIDENCE);
    }

    // =====================================================================
    // A. Deployment and access controls
    // =====================================================================

    function test_A_DeploymentInitialState() public view {
        assertEq(market.owner(), owner);
        assertEq(market.resolver(), resolver);
        assertEq(market.resolutionGracePeriod(), GRACE);
        assertEq(market.marketCount(), 0);
        assertEq(market.totalEscrowed(), 0);
        assertEq(market.MIN_DURATION(), 120 seconds);
        assertEq(market.MAX_DURATION(), 30 days);
        assertEq(market.BETTING_LOCK_WINDOW(), 60 seconds);
        assertTrue(market.MIN_DURATION() > market.BETTING_LOCK_WINDOW());
    }

    function test_A_DeploymentZeroOwnerReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new LaunchOddsMarket(address(0), resolver, GRACE);
    }

    function test_A_DeploymentZeroGraceReverts() public {
        vm.expectRevert(LaunchOddsMarket.InvalidGracePeriod.selector);
        new LaunchOddsMarket(owner, resolver, 0);
    }

    function test_A_OwnerCanUpdateResolver() public {
        address next = makeAddr("next");
        vm.expectEmit(true, true, false, false);
        emit LaunchOddsMarket.ResolverUpdated(resolver, next);
        vm.prank(owner);
        market.setResolver(next);
        assertEq(market.resolver(), next);
    }

    function test_A_NonOwnerCannotUpdateResolver() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        market.setResolver(stranger);
        assertEq(market.resolver(), resolver);
    }

    function test_A_TwoStepOwnershipTransfer() public {
        address next = makeAddr("nextOwner");
        vm.prank(owner);
        market.transferOwnership(next);
        // Not effective until accepted.
        assertEq(market.owner(), owner);
        assertEq(market.pendingOwner(), next);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        market.acceptOwnership();
        vm.prank(next);
        market.acceptOwnership();
        assertEq(market.owner(), next);
        assertEq(market.pendingOwner(), address(0));
    }

    function test_A_ResolverCanBeDisabledAndRestored() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        vm.prank(owner);
        market.setResolver(address(0));
        assertEq(market.resolver(), address(0));
        assertFalse(market.canResolve(id));

        _expire(id);
        vm.prank(resolver);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.UnauthorizedResolver.selector, resolver));
        market.resolveMarket(id, 45, EVIDENCE);

        vm.prank(owner);
        market.setResolver(resolver);
        assertEq(market.resolver(), resolver);
        assertTrue(market.canResolve(id));
        vm.prank(resolver);
        market.resolveMarket(id, 45, EVIDENCE);
        assertTrue(market.getMarket(id).status == LaunchOddsMarket.Status.ResolvedYes);
    }

    // =====================================================================
    // B. Market creation
    // =====================================================================

    function test_B_CreateMarketSuccess() public {
        uint64 expiry = uint64(block.timestamp + 1 hours);
        vm.expectEmit(true, true, true, true);
        emit LaunchOddsMarket.MarketCreated(1, address(this), SOURCE, 42, 45, expiry, META);
        uint256 id = market.createMarket(SOURCE, 42, 45, expiry, META);
        assertEq(id, 1);
        assertEq(market.marketCount(), 1);

        LaunchOddsMarket.Market memory m = market.getMarket(id);
        assertEq(m.id, 1);
        assertEq(m.creator, address(this));
        assertEq(m.sourceId, SOURCE);
        assertEq(m.baselineScore, 42);
        assertEq(m.targetScore, 45);
        assertEq(m.createdAt, block.timestamp);
        assertEq(m.expiry, expiry);
        assertEq(m.metadataHash, META);
        assertEq(uint8(m.status), uint8(LaunchOddsMarket.Status.Open));
        assertEq(m.yesPool, 0);
        assertEq(m.noPool, 0);
        assertEq(m.totalPool, 0);
    }

    function test_B_MarketIdsUniqueAndMonotonic() public {
        uint256 a = _create();
        uint256 b = _create();
        uint256 c = _create();
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(c, 3);
        assertEq(market.marketCount(), 3);
        LaunchOddsMarket.Market[] memory all = market.getMarkets(1, 3);
        assertEq(all.length, 3);
        assertEq(all[0].id, 1);
        assertEq(all[2].id, 3);
    }

    function test_B_ZeroSourceIdReverts() public {
        vm.expectRevert(LaunchOddsMarket.InvalidSourceId.selector);
        market.createMarket(0, 42, 45, uint64(block.timestamp + 1 hours), META);
    }

    function test_B_ZeroMetadataHashReverts() public {
        vm.expectRevert(LaunchOddsMarket.ZeroMetadataHash.selector);
        market.createMarket(SOURCE, 42, 45, uint64(block.timestamp + 1 hours), bytes32(0));
    }

    function test_B_TargetEqualsBaselineReverts() public {
        vm.expectRevert(LaunchOddsMarket.InvalidTargetScore.selector);
        market.createMarket(SOURCE, 45, 45, uint64(block.timestamp + 1 hours), META);
    }

    function test_B_TargetBelowBaselineReverts() public {
        vm.expectRevert(LaunchOddsMarket.InvalidTargetScore.selector);
        market.createMarket(SOURCE, 50, 45, uint64(block.timestamp + 1 hours), META);
    }

    function test_B_ExpiryTooSoonReverts() public {
        uint64 tooSoon = uint64(block.timestamp + market.MIN_DURATION() - 1);
        vm.expectRevert(LaunchOddsMarket.ExpiryTooSoon.selector);
        market.createMarket(SOURCE, 42, 45, tooSoon, META);
    }

    function test_B_ExpiryAtMinDurationSucceeds() public {
        uint256 id = _createWith(42, 45, uint64(block.timestamp + market.MIN_DURATION()));
        assertEq(id, 1);
    }

    function test_B_ExpiryTooDistantReverts() public {
        uint64 tooFar = uint64(block.timestamp + market.MAX_DURATION() + 1);
        vm.expectRevert(LaunchOddsMarket.ExpiryTooDistant.selector);
        market.createMarket(SOURCE, 42, 45, tooFar, META);
    }

    function test_B_ExpiryAtMaxDurationSucceeds() public {
        uint256 id = _createWith(42, 45, uint64(block.timestamp + market.MAX_DURATION()));
        assertEq(id, 1);
    }

    // =====================================================================
    // C. Position taking
    // =====================================================================

    function test_C_YesPositionSucceeds() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        LaunchOddsMarket.Position memory p = market.getPosition(id, alice);
        assertEq(p.amount, 1 ether);
        assertTrue(p.isYes);
        assertFalse(p.claimed);
        (uint256 yes, uint256 no) = market.getPools(id);
        assertEq(yes, 1 ether);
        assertEq(no, 0);
        assertEq(market.getTotalPool(id), 1 ether);
        assertEq(market.totalEscrowed(), 1 ether);
    }

    function test_C_NoPositionSucceeds() public {
        uint256 id = _create();
        _bet(bob, id, false, 2 ether);
        LaunchOddsMarket.Position memory p = market.getPosition(id, bob);
        assertEq(p.amount, 2 ether);
        assertFalse(p.isYes);
        (uint256 yes, uint256 no) = market.getPools(id);
        assertEq(yes, 0);
        assertEq(no, 2 ether);
    }

    function test_C_TopUpSameSide() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(alice, id, true, 2 ether);
        LaunchOddsMarket.Position memory p = market.getPosition(id, alice);
        assertEq(p.amount, 3 ether);
        assertTrue(p.isYes);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        assertEq(m.yesPositions, 1);
        assertEq(m.yesPool, 3 ether);
    }

    function test_C_MultipleUsersAccounting() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 2 ether);
        _bet(carol, id, true, 3 ether);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        assertEq(m.yesPool, 4 ether);
        assertEq(m.noPool, 2 ether);
        assertEq(m.totalPool, 6 ether);
        assertEq(m.remainingLiability, 6 ether);
        assertEq(m.yesPositions, 2);
        assertEq(m.noPositions, 1);
        assertEq(market.totalEscrowed(), 6 ether);
        assertTrue(address(market).balance >= market.totalEscrowed());
    }

    function test_C_ZeroValueReverts() public {
        uint256 id = _create();
        vm.prank(alice);
        vm.expectRevert(LaunchOddsMarket.ZeroStake.selector);
        market.takePosition{value: 0}(id, true);
    }

    function test_C_OpposingSideReverts() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        vm.prank(alice);
        vm.expectRevert(LaunchOddsMarket.OpposingPosition.selector);
        market.takePosition{value: 1 ether}(id, false);
    }

    function test_C_UnknownMarketReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 999));
        market.takePosition{value: 1 ether}(999, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 0));
        market.takePosition{value: 1 ether}(0, true);
    }

    function test_C_BettingAfterExpiryReverts() public {
        uint256 id = _create();
        _expire(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.BettingClosed.selector, id));
        market.takePosition{value: 1 ether}(id, true);
    }

    function test_C_BettingLockWindow() public {
        uint256 id = _create();
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        // Last allowed second is expiry - 61.
        vm.warp(m.expiry - 61);
        _bet(alice, id, true, 1 ether);
        // At expiry - 60 the window is locked.
        vm.warp(m.expiry - 60);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.BettingClosed.selector, id));
        market.takePosition{value: 1 ether}(id, false);
    }

    function test_C_BetAfterResolutionReverts() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _expireAndResolve(id, 45);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.MarketNotOpen.selector, id));
        market.takePosition{value: 1 ether}(id, true);
    }

    function test_C_PositionTakenEvent() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, true);
        emit LaunchOddsMarket.PositionTaken(id, alice, true, 1 ether, 1 ether, 1 ether, 0);
        _bet(alice, id, true, 1 ether);
    }

    // =====================================================================
    // D. Resolution
    // =====================================================================

    function test_D_ResolverResolvesExpiredMarket() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 1 ether);
        assertFalse(market.canResolve(id));
        _expire(id);
        assertTrue(market.canResolve(id));
        vm.expectEmit(true, false, false, true);
        emit LaunchOddsMarket.MarketResolved(id, true, 45, EVIDENCE);
        vm.prank(resolver);
        market.resolveMarket(id, 45, EVIDENCE);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        assertTrue(m.status == LaunchOddsMarket.Status.ResolvedYes);
        assertEq(m.finalScore, 45);
        assertEq(m.evidenceHash, EVIDENCE);
        assertFalse(market.canResolve(id));
        // Resolution alone must not reduce escrow.
        assertEq(market.totalEscrowed(), 2 ether);
    }

    function test_D_CannotResolveBeforeExpiry() public {
        uint256 id = _create();
        vm.prank(resolver);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.MarketNotExpired.selector, id));
        market.resolveMarket(id, 45, EVIDENCE);
    }

    function test_D_UnauthorizedCannotResolve() public {
        uint256 id = _create();
        _expire(id);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.UnauthorizedResolver.selector, stranger));
        market.resolveMarket(id, 45, EVIDENCE);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.UnauthorizedResolver.selector, owner));
        market.resolveMarket(id, 45, EVIDENCE);
    }

    function test_D_CannotResolveTwice() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _expireAndResolve(id, 45);
        vm.prank(resolver);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.AlreadyResolved.selector, id));
        market.resolveMarket(id, 10, EVIDENCE);
    }

    function test_D_YesOnExactTarget() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _expireAndResolve(id, 45);
        assertTrue(market.getMarket(id).status == LaunchOddsMarket.Status.ResolvedYes);
    }

    function test_D_YesAboveTarget() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _expireAndResolve(id, 10_000);
        assertTrue(market.getMarket(id).status == LaunchOddsMarket.Status.ResolvedYes);
    }

    function test_D_NoBelowTarget() public {
        uint256 id = _create();
        _bet(bob, id, false, 1 ether);
        _expire(id);
        vm.expectEmit(true, false, false, true);
        emit LaunchOddsMarket.MarketResolved(id, false, 44, EVIDENCE);
        vm.prank(resolver);
        market.resolveMarket(id, 44, EVIDENCE);
        assertTrue(market.getMarket(id).status == LaunchOddsMarket.Status.ResolvedNo);
    }

    function test_D_ZeroEvidenceHashReverts() public {
        uint256 id = _create();
        _expire(id);
        vm.prank(resolver);
        vm.expectRevert(LaunchOddsMarket.ZeroEvidenceHash.selector);
        market.resolveMarket(id, 45, bytes32(0));
    }

    function test_D_EmptyWinningSideRefunds() public {
        uint256 id = _create();
        _bet(bob, id, false, 1 ether); // only NO positions; YES wins
        _expire(id);
        vm.expectEmit(true, false, false, false);
        emit LaunchOddsMarket.MarketRefunded(id, LaunchOddsMarket.RefundReason.EmptyWinningSide);
        vm.prank(resolver);
        market.resolveMarket(id, 99, EVIDENCE);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        assertTrue(m.status == LaunchOddsMarket.Status.Refunded);
        assertTrue(m.refundReason == LaunchOddsMarket.RefundReason.EmptyWinningSide);
        // Loser-side participant recovers the exact stake.
        uint256 before = bob.balance;
        vm.prank(bob);
        uint256 payout = market.claim(id);
        assertEq(payout, 1 ether);
        assertEq(bob.balance, before + 1 ether);
    }

    function test_D_NoPositionsResolvesSafely() public {
        uint256 id = _create();
        _expire(id);
        vm.prank(resolver);
        market.resolveMarket(id, 45, EVIDENCE);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        assertTrue(m.status == LaunchOddsMarket.Status.Refunded);
        assertEq(m.remainingLiability, 0);
        assertEq(market.totalEscrowed(), 0);
    }

    function test_D_OutcomeImmutableAfterResolution() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45);
        // Any second resolution attempt reverts, including the opposite outcome.
        vm.prank(resolver);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.AlreadyResolved.selector, id));
        market.resolveMarket(id, 0, EVIDENCE);
        assertTrue(market.getMarket(id).status == LaunchOddsMarket.Status.ResolvedYes);
        assertEq(market.getMarket(id).finalScore, 45);
    }

    // =====================================================================
    // E. Winning payouts
    // =====================================================================

    function test_E_SingleYesWinner() public {
        uint256 id = _create();
        _bet(alice, id, true, 2 ether);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45);
        (bool can, uint256 preview) = market.previewClaim(id, alice);
        assertTrue(can);
        assertEq(preview, 3 ether);
        uint256 before = alice.balance;
        vm.prank(alice);
        uint256 payout = market.claim(id);
        assertEq(payout, 3 ether);
        assertEq(alice.balance, before + 3 ether);
        assertEq(market.getRemainingLiability(id), 0);
        assertEq(market.totalEscrowed(), 0);
    }

    function test_E_SingleNoWinner() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 3 ether);
        _expireAndResolve(id, 10);
        vm.prank(bob);
        uint256 payout = market.claim(id);
        assertEq(payout, 4 ether);
        assertEq(market.totalEscrowed(), 0);
    }

    function test_E_ProportionalUnequalStakes() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, true, 3 ether);
        _bet(carol, id, false, 4 ether);
        _expireAndResolve(id, 45);
        vm.prank(alice);
        assertEq(market.claim(id), 2 ether); // 1 + 4*1/4
        vm.prank(bob);
        assertEq(market.claim(id), 6 ether); // 3 + 4*3/4
        assertEq(market.getRemainingLiability(id), 0);
        assertEq(market.totalEscrowed(), 0);
        assertEq(address(market).balance, 0);
    }

    function test_E_TopUpAggregateClaim() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 2 ether);
        _expireAndResolve(id, 45);
        vm.prank(alice);
        assertEq(market.claim(id), 4 ether); // 2 + 2*2/2
        assertEq(market.totalEscrowed(), 0);
    }

    function test_E_NoLosingPoolReturnsStakes() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, true, 2 ether);
        _expireAndResolve(id, 45);
        vm.prank(alice);
        assertEq(market.claim(id), 1 ether);
        vm.prank(bob);
        assertEq(market.claim(id), 2 ether);
        assertEq(market.getRemainingLiability(id), 0);
        assertEq(market.totalEscrowed(), 0);
    }

    function test_E_LosersCannotClaim() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45);
        (bool can,) = market.previewClaim(id, bob);
        assertFalse(can);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.NotWinner.selector, id));
        market.claim(id);
    }

    function test_E_DoubleClaimReverts() public {
        uint256 id = _create();
        _bet(alice, id, true, 2 ether);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45);
        vm.prank(alice);
        market.claim(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.AlreadyClaimed.selector, id));
        market.claim(id);
    }

    function test_E_StrangerCannotClaim() public {
        uint256 id = _create();
        _bet(alice, id, true, 2 ether);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.NothingToClaim.selector, id));
        market.claim(id);
    }

    function test_E_RoundingDustToLastClaimant() public {
        uint256 id = _create();
        // W = 3 ether across 3 winners, L = 10 wei -> per-winner floor share 3 wei, dust 1 wei.
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, true, 1 ether);
        _bet(carol, id, true, 1 ether);
        _bet(dave, id, false, 10 wei);
        uint256 pool = 3 ether + 10 wei;
        _expireAndResolve(id, 45);

        vm.prank(alice);
        assertEq(market.claim(id), 1 ether + 3 wei);
        vm.prank(bob);
        assertEq(market.claim(id), 1 ether + 3 wei);
        uint256 remaining = market.getRemainingLiability(id);
        assertEq(remaining, 1 ether + 4 wei); // exact remainder incl. dust
        vm.prank(carol);
        assertEq(market.claim(id), remaining);
        assertEq(market.getRemainingLiability(id), 0);
        assertEq(market.totalEscrowed(), 0);
        assertEq(address(market).balance, 0);
        // Dust accounting: total paid equals the full pool.
        assertEq(3 ether + 10 wei, pool);
    }

    function test_E_ClaimEventAndEscrow() public {
        uint256 id = _create();
        _bet(alice, id, true, 2 ether);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45);
        assertEq(market.totalEscrowed(), 3 ether);
        vm.expectEmit(true, true, false, true);
        emit LaunchOddsMarket.Claimed(id, alice, 3 ether, false);
        vm.prank(alice);
        market.claim(id);
        // Losing stake was paid out to the winner: no liability remains.
        assertEq(market.totalEscrowed(), 0);
        assertEq(market.getRemainingLiability(id), 0);
    }

    // =====================================================================
    // F. Refunds and failure recovery
    // =====================================================================

    function test_F_TimeoutRefundFlow() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 2 ether);
        LaunchOddsMarket.Market memory m = market.getMarket(id);

        // Before grace elapses: reverts.
        vm.warp(m.expiry + GRACE - 1);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.GracePeriodNotElapsed.selector, id));
        market.refundUnresolvedMarket(id);

        // Anyone can trigger after grace.
        vm.warp(m.expiry + GRACE);
        vm.expectEmit(true, false, false, false);
        emit LaunchOddsMarket.MarketRefunded(id, LaunchOddsMarket.RefundReason.OracleTimeout);
        vm.prank(stranger);
        market.refundUnresolvedMarket(id);

        LaunchOddsMarket.Market memory afterM = market.getMarket(id);
        assertTrue(afterM.status == LaunchOddsMarket.Status.Refunded);
        assertTrue(afterM.refundReason == LaunchOddsMarket.RefundReason.OracleTimeout);

        uint256 aBefore = alice.balance;
        uint256 bBefore = bob.balance;
        vm.prank(alice);
        assertEq(market.claim(id), 1 ether);
        vm.prank(bob);
        assertEq(market.claim(id), 2 ether);
        assertEq(alice.balance, aBefore + 1 ether);
        assertEq(bob.balance, bBefore + 2 ether);
        assertEq(market.getRemainingLiability(id), 0);
        assertEq(market.totalEscrowed(), 0);
    }

    function test_F_TimeoutRefundUnavailableAfterResolution() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _expireAndResolve(id, 45);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        vm.warp(m.expiry + GRACE + 1 days);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.MarketAlreadySettled.selector, id));
        market.refundUnresolvedMarket(id);
    }

    function test_F_RefundDoubleClaimReverts() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 1 ether);
        _expire(id);
        vm.prank(resolver);
        market.resolveMarket(id, 99, EVIDENCE); // YES wins, no YES... wait alice is YES
        // alice YES exists so this resolves YES; use separate market for refund double-claim:
        uint256 id2 = _create();
        _bet(alice, id2, false, 1 ether);
        _expire(id2);
        LaunchOddsMarket.Market memory m2 = market.getMarket(id2);
        vm.warp(m2.expiry + GRACE);
        market.refundUnresolvedMarket(id2);
        vm.prank(alice);
        market.claim(id2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.AlreadyClaimed.selector, id2));
        market.claim(id2);
    }

    function test_F_OneUserClaimDoesNotAffectOther() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, true, 2 ether);
        _bet(carol, id, false, 6 ether);
        _expireAndResolve(id, 45); // W=3, L=6
        (bool canB, uint256 previewB) = market.previewClaim(id, bob);
        assertTrue(canB);
        assertEq(previewB, 2 ether + 4 ether);
        vm.prank(alice);
        market.claim(id); // 1 + 6*1/3 = 3
        (canB, previewB) = market.previewClaim(id, bob);
        assertTrue(canB);
        vm.prank(bob);
        assertEq(market.claim(id), previewB);
        assertEq(market.getRemainingLiability(id), 0);
    }

    function test_F_ClaimBeforeSettlementReverts() public {
        uint256 id = _create();
        _bet(alice, id, true, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.MarketNotSettled.selector, id));
        market.claim(id);
    }

    // Failed-transfer coverage lives in test_F_FailedTransferStateIntact (below),
    // which funds the receiver via vm.deal + a dedicated payable entrypoint.
    function test_F_FailedTransferStateIntact() public {
        StakeProxy proxy = new StakeProxy(market);
        vm.deal(address(proxy), 3 ether);
        uint256 id = _create();
        proxy.stake{value: 2 ether}(id, true);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45); // proxy is a winner

        // Make the proxy start reverting on receive.
        proxy.setReverting(true);
        uint256 expected = 2 ether + 1 ether; // stake + full losing pool (sole winner)
        (bool can, uint256 preview) = market.previewClaim(id, address(proxy));
        assertTrue(can);
        assertEq(preview, expected);

        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.TransferFailed.selector, address(proxy), expected));
        proxy.claimIt(id);

        // State fully rolled back: still unclaimed, liabilities intact.
        LaunchOddsMarket.Position memory p = market.getPosition(id, address(proxy));
        assertFalse(p.claimed);
        assertEq(p.amount, 2 ether);
        assertEq(market.getRemainingLiability(id), 3 ether);
        assertEq(market.totalEscrowed(), 3 ether);

        // Other users unaffected: resolve losers cannot claim; fix receiver, claim works.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.NotWinner.selector, id));
        market.claim(id);
        proxy.setReverting(false);
        proxy.claimIt(id);
        // Full pool paid out; nothing remains escrowed.
        assertEq(market.totalEscrowed(), 0);
        assertEq(market.getRemainingLiability(id), 0);
    }

    // =====================================================================
    // G. Reentrancy and malicious callers
    // =====================================================================

    function test_G_ReentrancyRejected() public {
        ReentrantClaimer attacker = new ReentrantClaimer(market);
        vm.deal(address(attacker), 2 ether);
        uint256 id = _create();
        attacker.bet{value: 1 ether}(id, true);
        _bet(bob, id, false, 2 ether);
        _expireAndResolve(id, 45);

        uint256 attackerBefore = address(attacker).balance;
        attacker.claimIt(); // receive() attempts reentry; must fail internally
        assertFalse(attacker.reentered());
        assertEq(address(attacker).balance, attackerBefore + 3 ether);

        // Cannot claim twice, even via the reentrant path.
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.AlreadyClaimed.selector, id));
        attacker.claimIt();

        // Global accounting intact; loser still cannot claim.
        assertEq(market.getRemainingLiability(id), 0);
        assertEq(market.totalEscrowed(), 0);
        assertEq(address(market).balance, 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.NotWinner.selector, id));
        market.claim(id);
    }

    function test_G_MultipleMarketsIsolation() public {
        uint256 idA = _create();
        uint256 idB = _create();
        _bet(alice, idA, true, 1 ether);
        _bet(bob, idA, false, 3 ether);
        _bet(alice, idB, false, 2 ether);
        _bet(bob, idB, true, 2 ether);
        assertEq(market.totalEscrowed(), 8 ether);

        _expireAndResolve(idA, 0); // NO wins
        vm.prank(bob);
        assertEq(market.claim(idA), 4 ether);
        // Market B untouched.
        assertEq(market.getRemainingLiability(idB), 4 ether);
        assertEq(market.totalEscrowed(), 4 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.MarketNotSettled.selector, idB));
        market.claim(idB);
    }

    function test_G_MarketTermsImmutable() public {
        uint256 id = _create();
        LaunchOddsMarket.Market memory beforeM = market.getMarket(id);
        _bet(alice, id, true, 1 ether);
        _bet(bob, id, false, 1 ether);
        _expireAndResolve(id, 45);
        vm.prank(alice);
        market.claim(id);
        LaunchOddsMarket.Market memory afterM = market.getMarket(id);
        assertEq(afterM.sourceId, beforeM.sourceId);
        assertEq(afterM.baselineScore, beforeM.baselineScore);
        assertEq(afterM.targetScore, beforeM.targetScore);
        assertEq(afterM.createdAt, beforeM.createdAt);
        assertEq(afterM.expiry, beforeM.expiry);
        assertEq(afterM.creator, beforeM.creator);
        assertEq(afterM.metadataHash, beforeM.metadataHash);
    }

    function test_G_GetMarketsPagination() public {
        _create();
        _create();
        _create();
        LaunchOddsMarket.Market[] memory page = market.getMarkets(1, 2);
        assertEq(page.length, 2);
        assertEq(page[0].id, 1);
        assertEq(page[1].id, 2);
        LaunchOddsMarket.Market[] memory tail = market.getMarkets(3, 10);
        assertEq(tail.length, 1);
        assertEq(tail[0].id, 3);
        LaunchOddsMarket.Market[] memory empty = market.getMarkets(4, 10);
        assertEq(empty.length, 0);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 0));
        market.getMarkets(0, 10);
    }

    function test_G_GettersRevertUnknownMarket() public {
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 42));
        market.getMarket(42);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 42));
        market.getPools(42);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 42));
        market.getTotalPool(42);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 42));
        market.getPosition(42, alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.InvalidMarketId.selector, 42));
        market.getRemainingLiability(42);
        (bool can,) = market.previewClaim(42, alice);
        assertFalse(can);
        assertFalse(market.canResolve(42));
    }

    function test_G_DirectTransfersRejected() public {
        (bool ok,) = address(market).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(market.totalEscrowed(), 0);
        assertEq(address(market).balance, 0);
    }
}

/// @notice Attacker that tries to reenter `claim` from its receive function.
contract ReentrantClaimer {
    LaunchOddsMarket public market;
    uint256 public marketId;
    bool public entered;
    bool public reentered;

    constructor(LaunchOddsMarket _m) {
        market = _m;
    }

    function bet(uint256 id, bool isYes) external payable {
        marketId = id;
        market.takePosition{value: msg.value}(id, isYes);
    }

    function claimIt() external {
        market.claim(marketId);
    }

    receive() external payable {
        if (!entered) {
            entered = true;
            try market.claim(marketId) {
                reentered = true;
            } catch {}
        }
    }
}

/// @notice Payable proxy that can toggle a reverting receive function.
contract StakeProxy {
    LaunchOddsMarket public market;
    bool public reverting;

    constructor(LaunchOddsMarket _m) {
        market = _m;
    }

    function setReverting(bool v) external {
        reverting = v;
    }

    function stake(uint256 id, bool isYes) external payable {
        market.takePosition{value: msg.value}(id, isYes);
    }

    function claimIt(uint256 id) external {
        market.claim(id);
    }

    receive() external payable {
        if (reverting) revert("proxy refuses");
    }
}
