// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Marketplace.sol";

// exposes internal functions of Marketplace for testing
contract TestMarketplace is Marketplace {
  constructor(
    IERC20 _token,
    uint256 _collateral,
    uint256 _minCollateralThreshold,
    uint256 _slashMisses,
    uint256 _slashPercentage,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime
  )
    Marketplace(
      _token,
      _collateral,
      _minCollateralThreshold,
      _slashMisses,
      _slashPercentage,
      _proofPeriod,
      _proofTimeout,
      _proofDowntime
    )
  // solhint-disable-next-line no-empty-blocks
  {

  }

  function forciblyFreeSlot(SlotId slotId) public {
    _forciblyFreeSlot(slotId);
  }

  function slot(SlotId slotId) public view returns (Slot memory) {
    return _slot(slotId);
  }
}
