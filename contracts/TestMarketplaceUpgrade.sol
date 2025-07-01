// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Marketplace.sol";

// exposes internal functions of Marketplace for testing
contract TestMarketplaceUpgraded is Marketplace {

  function newShinyMethod() public pure returns (uint256) {
    return 42;
  }
}
