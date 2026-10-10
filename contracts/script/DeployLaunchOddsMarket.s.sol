// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {LaunchOddsMarket} from "../src/LaunchOddsMarket.sol";

/// @title DeployLaunchOddsMarket
/// @notice Deployment script for LaunchOddsMarket on Monad testnet.
/// @dev Configure via environment variables; NEVER commit private keys.
///   INITIAL_OWNER: owner address (required)
///   INITIAL_RESOLVER: resolver address, or zero address to deploy disabled (required)
///   RESOLUTION_GRACE_PERIOD: seconds after expiry before permissionless refund (required)
///
/// Example (DO NOT run with real keys in CI logs):
///   INITIAL_OWNER=0x... INITIAL_RESOLVER=0x... RESOLUTION_GRACE_PERIOD=86400 \
///     forge script script/DeployLaunchOddsMarket.s.sol --rpc-url $MONAD_TESTNET_RPC --broadcast
contract DeployLaunchOddsMarket is Script {
    function run() external returns (LaunchOddsMarket market) {
        address initialOwner = vm.envAddress("INITIAL_OWNER");
        address initialResolver = vm.envAddress("INITIAL_RESOLVER");
        uint256 gracePeriod = vm.envUint("RESOLUTION_GRACE_PERIOD");

        vm.startBroadcast();
        market = new LaunchOddsMarket(initialOwner, initialResolver, gracePeriod);
        vm.stopBroadcast();

        console.log("LaunchOddsMarket deployed at:", address(market));
        console.log("owner:", market.owner());
        console.log("resolver:", market.resolver());
        console.log("resolutionGracePeriod:", market.resolutionGracePeriod());
    }
}
