// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Marketplace.sol";

// exposes internal functions of Marketplace for testing
contract TestMarketplace is Marketplace {
  constructor(
    IERC20 token,
    MarketplaceConfig memory config
  )
  Marketplace(token, config) // solhint-disable-next-line no-empty-blocks
  {}

  function forciblyFreeSlot(SlotId slotId) public {
    _forciblyFreeSlot(slotId);
  }

  function getSlotCollateral(SlotId slotId) public view returns (uint256) {
    return _slots[slotId].currentCollateral;
  }

  function getHost(SlotId slotId) public view returns (address) {
    return _slots[slotId].host;
  }
}
