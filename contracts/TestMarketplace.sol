// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Marketplace.sol";

// exposes internal functions of Marketplace for testing
contract TestMarketplace is Marketplace {
  constructor(
    IERC20 _token,
    uint256 _collateral,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime
  )
    Marketplace(_token, _collateral, _proofPeriod,_proofTimeout,_proofDowntime)
  // solhint-disable-next-line no-empty-blocks
  {

  }

  function isCancelled(RequestId requestId) public view returns (bool) {
    return _isCancelled(requestId);
  }

  function isSlotCancelled(SlotId slotId) public view returns (bool) {
    return _isSlotCancelled(slotId);
  }

  function forciblyFreeSlot(SlotId slotId) public {
    _forciblyFreeSlot(slotId);
  }

  function slot(SlotId slotId) public view returns (Slot memory) {
    return _slot(slotId);
  }

  function testAcceptsProofs(SlotId slotId)
    public
    view
    slotMustAcceptProofs(slotId)
  // solhint-disable-next-line no-empty-blocks
  {

  }
}
