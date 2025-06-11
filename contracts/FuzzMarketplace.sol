// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./TestToken.sol";
import "./Marketplace.sol";
import "./Vault.sol";
import "./TestVerifier.sol";

contract FuzzMarketplace is Marketplace {
  constructor()
    Marketplace(
      MarketplaceConfig(
        CollateralConfig(10, 5, 10, 20),
        ProofConfig(10, 5, 64, 67, ""),
        SlotReservationsConfig(20),
        60 * 60 * 24 * 30 // 30 days
      ),
      new Vault(new TestToken()),
      new TestVerifier()
    )
  {}

  // Properties to be tested through fuzzing

  MarketplaceTotals private _lastSeenTotals;

  function neverDecreaseTotals() public {
    assert(_marketplaceTotals.received >= _lastSeenTotals.received);
    assert(_marketplaceTotals.sent >= _lastSeenTotals.sent);
    _lastSeenTotals = _marketplaceTotals;
  }

  function neverLoseFunds() public view {
    uint256 total = _marketplaceTotals.received - _marketplaceTotals.sent;
    assert(token().balanceOf(address(this)) >= total);
  }
}
