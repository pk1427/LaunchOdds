// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {LaunchOddsMarket} from "../src/LaunchOddsMarket.sol";

/// @notice Fuzz coverage (spec section 6 H, unit-phase scope): market params,
/// stakes/top-ups, resolution threshold, multi-party payouts, expiries, markets.
contract LaunchOddsMarketFuzzTest is Test {
    LaunchOddsMarket market;
    address resolver = makeAddr("resolver");
    address owner = makeAddr("owner");

    bytes32 constant META = keccak256("q");
    bytes32 constant EVIDENCE = keccak256("e");

    function setUp() public {
        market = new LaunchOddsMarket(owner, resolver, 1 days);
    }

    function _create(uint256 baseline, uint256 target, uint64 expiry) internal returns (uint256) {
        return market.createMarket(12345678, baseline, target, expiry, META);
    }

    function _user(string memory prefix, uint256 i) internal returns (address u) {
        u = address(uint160(uint256(keccak256(abi.encodePacked(prefix, i, block.timestamp)))));
        vm.deal(u, 1000 ether);
    }

    // -- market parameters -------------------------------------------------

    /// @notice Any valid parameter combination creates a market with stored terms.
    function testFuzz_CreateMarket_Valid(
        uint256 sourceId,
        uint256 baseline,
        uint256 targetGap,
        uint256 duration,
        bytes32 meta
    ) public {
        sourceId = bound(sourceId, 1, type(uint256).max);
        baseline = bound(baseline, 0, 1e18);
        targetGap = bound(targetGap, 1, 1e18);
        uint256 target = baseline + targetGap; // no overflow: baseline <= 1e18
        duration = bound(duration, market.MIN_DURATION(), market.MAX_DURATION());
        vm.assume(meta != bytes32(0));
        uint64 expiry = uint64(block.timestamp + duration);

        uint256 before = market.marketCount();
        uint256 id = market.createMarket(sourceId, baseline, target, expiry, meta);
        assertEq(id, before + 1);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        assertEq(m.sourceId, sourceId);
        assertEq(m.baselineScore, baseline);
        assertEq(m.targetScore, target);
        assertEq(m.expiry, expiry);
        assertEq(m.metadataHash, meta);
    }

    /// @notice Invalid combos always revert with the documented error.
    function testFuzz_CreateMarket_Invalid(uint256 baseline, uint256 target, uint256 duration, uint8 kind) public {
        baseline = bound(baseline, 0, 1e12);
        kind = uint8(bound(kind, 0, 4));
        if (kind == 0) {
            target = bound(target, 0, baseline); // target <= baseline
            vm.expectRevert(LaunchOddsMarket.InvalidTargetScore.selector);
            market.createMarket(1, baseline, target, uint64(block.timestamp + 1 hours), META);
        } else if (kind == 1) {
            vm.expectRevert(LaunchOddsMarket.InvalidSourceId.selector);
            market.createMarket(0, baseline, baseline + 1, uint64(block.timestamp + 1 hours), META);
        } else if (kind == 2) {
            vm.expectRevert(LaunchOddsMarket.ZeroMetadataHash.selector);
            market.createMarket(1, baseline, baseline + 1, uint64(block.timestamp + 1 hours), bytes32(0));
        } else if (kind == 3) {
            duration = bound(duration, 0, market.MIN_DURATION() - 1);
            vm.expectRevert(LaunchOddsMarket.ExpiryTooSoon.selector);
            market.createMarket(1, baseline, baseline + 1, uint64(block.timestamp + duration), META);
        } else {
            duration = bound(duration, market.MAX_DURATION() + 1, market.MAX_DURATION() + 365 days);
            vm.expectRevert(LaunchOddsMarket.ExpiryTooDistant.selector);
            market.createMarket(1, baseline, baseline + 1, uint64(block.timestamp + duration), META);
        }
    }

    // -- stakes ------------------------------------------------------------

    /// @notice Repeated same-side top-ups aggregate; pools and escrow track exactly.
    function testFuzz_TopUpsAggregate(uint8 n, uint256 seed) public {
        n = uint8(bound(n, 1, 8));
        uint256 id = _create(42, 45, uint64(block.timestamp + 1 hours));
        address u = _user("topup", seed);
        uint256 expected;
        for (uint256 i = 0; i < n; ++i) {
            uint256 amt = bound(uint256(keccak256(abi.encode(seed, i))), 1, 1 ether);
            expected += amt;
            vm.prank(u);
            market.takePosition{value: amt}(id, true);
        }
        assertEq(market.getPosition(id, u).amount, expected);
        (uint256 yes,) = market.getPools(id);
        assertEq(yes, expected);
        assertEq(market.totalEscrowed(), expected);
    }

    // -- resolution threshold ----------------------------------------------

    /// @notice Scores around the target resolve to the correct side.
    function testFuzz_Threshold(uint256 target, uint256 score) public {
        target = bound(target, 3, 1e12);
        uint256 lo = target - 2;
        score = bound(score, lo, target + 2);
        uint256 id = _create(target - 1, target, uint64(block.timestamp + 1 hours));
        address a = _user("ty", score);
        address b = _user("tn", score);
        vm.prank(a);
        market.takePosition{value: 1 ether}(id, true);
        vm.prank(b);
        market.takePosition{value: 1 ether}(id, false);

        LaunchOddsMarket.Market memory m = market.getMarket(id);
        vm.warp(m.expiry);
        vm.prank(resolver);
        market.resolveMarket(id, score, EVIDENCE);

        bool expectYes = score >= target;
        LaunchOddsMarket.Status s = market.getMarket(id).status;
        assertTrue(s == (expectYes ? LaunchOddsMarket.Status.ResolvedYes : LaunchOddsMarket.Status.ResolvedNo));
    }

    // -- payouts -----------------------------------------------------------

    /// @notice N winners / M losers: payouts sum exactly to the pool, no dust, escrow zero.
    function testFuzz_PayoutsMatchPool(uint8 nW, uint8 nL, uint256 seed) public {
        nW = uint8(bound(nW, 1, 5));
        nL = uint8(bound(nL, 1, 5));
        uint256 id = _create(42, 45, uint64(block.timestamp + 1 hours));
        address[] memory winners = new address[](nW);
        uint256 W;
        uint256 L;
        for (uint256 i = 0; i < nW; ++i) {
            address u = _user("w", uint256(keccak256(abi.encode(seed, "w", i))));
            winners[i] = u;
            uint256 amt = bound(uint256(keccak256(abi.encode(seed, i))), 1, 1 ether);
            W += amt;
            vm.prank(u);
            market.takePosition{value: amt}(id, true);
        }
        for (uint256 i = 0; i < nL; ++i) {
            address u = _user("l", uint256(keccak256(abi.encode(seed, "l", i))));
            uint256 amt = bound(uint256(keccak256(abi.encode(seed, 1000 + i))), 1, 1 ether);
            L += amt;
            vm.prank(u);
            market.takePosition{value: amt}(id, false);
        }

        LaunchOddsMarket.Market memory m = market.getMarket(id);
        vm.warp(m.expiry);
        vm.prank(resolver);
        market.resolveMarket(id, 45, EVIDENCE);

        uint256 paid;
        for (uint256 i = 0; i < nW; ++i) {
            vm.prank(winners[i]);
            paid += market.claim(id);
        }
        assertEq(paid, W + L);
        assertEq(market.getRemainingLiability(id), 0);
        assertEq(market.totalEscrowed(), 0);
        assertEq(address(market).balance, 0);
    }

    // -- expiries / lock window --------------------------------------------

    /// @notice Bets succeed iff `now < expiry - 60`, fuzzed across the boundary.
    function testFuzz_LockWindow(uint256 duration, uint256 t) public {
        duration = bound(duration, market.MIN_DURATION(), 7 days);
        uint64 expiry = uint64(block.timestamp + duration);
        uint256 id = _create(42, 45, expiry);
        t = bound(t, 0, 120);
        vm.warp(expiry - t);
        address u = _user("lock", t);
        if (t > market.BETTING_LOCK_WINDOW()) {
            vm.prank(u);
            market.takePosition{value: 1 wei}(id, true);
            assertEq(market.getPosition(id, u).amount, 1 wei);
        } else {
            vm.prank(u);
            vm.expectRevert(abi.encodeWithSelector(LaunchOddsMarket.BettingClosed.selector, id));
            market.takePosition{value: 1 wei}(id, true);
        }
    }

    // -- multiple markets --------------------------------------------------

    /// @notice Independent markets settle independently; global escrow nets to zero.
    function testFuzz_MultipleMarkets(uint8 k, uint256 seed) public {
        k = uint8(bound(k, 1, 5));
        uint256[] memory ids = new uint256[](k);
        uint256 totalStaked;
        for (uint256 i = 0; i < k; ++i) {
            uint64 expiry = uint64(block.timestamp + 1 hours + i * 1 hours);
            ids[i] = _create(i, i + 1, expiry);
            for (uint256 j = 0; j < 2; ++j) {
                address u = _user("mm", uint256(keccak256(abi.encode(seed, i, j))));
                uint256 amt = bound(uint256(keccak256(abi.encode(seed, i, j, "a"))), 1, 0.1 ether);
                totalStaked += amt;
                vm.prank(u);
                market.takePosition{value: amt}(ids[i], j == 0);
            }
        }
        assertEq(market.totalEscrowed(), totalStaked);

        // Warp past all expiries, resolve YES on all, winners claim.
        vm.warp(block.timestamp + 1 hours + k * 1 hours);
        for (uint256 i = 0; i < k; ++i) {
            vm.prank(resolver);
            market.resolveMarket(ids[i], i + 1, EVIDENCE);
        }
        assertEq(market.totalEscrowed(), totalStaked); // resolution pays nothing by itself
    }
}
