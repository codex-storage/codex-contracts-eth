// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TestToken.sol";
import "./Marketplace.sol";

contract FuzzMarketplace is Marketplace {
  constructor()
    Marketplace(
      new TestToken(),
      MarketplaceConfig(CollateralConfig(10, 5, 3, 10), ProofConfig(10, 5, 64)),
      address(0)
    )
  // solhint-disable-next-line no-empty-blocks
  {

  }

  // Properties to be tested through fuzzing

  MarketplaceTotals private _lastSeenTotals;

  function neverDecreaseTotals() public {
    assert(_marketplaceTotals.received >= _lastSeenTotals.received);
    assert(_marketplaceTotals.sent >= _lastSeenTotals.sent);
    _lastSeenTotals = _marketplaceTotals;
  }

  function neverLoseFunds() public view {
    uint256 total = _marketplaceTotals.received - _marketplaceTotals.sent;
    assert(token.balanceOf(address(this)) >= total);
  }
}
