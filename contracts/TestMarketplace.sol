// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Marketplace.sol";

// exposes internal functions of Marketplace for testing
contract TestMarketplace is Marketplace {
  function forciblyFreeSlot(SlotId slotId) public {
    _forciblyFreeSlot(slotId);
  }

  function getSlotCollateral(SlotId slotId) public view returns (uint256) {
    return _slots[slotId].currentCollateral;
  }

  function challengeToFieldElement(
    bytes32 challenge
  ) public pure returns (uint256) {
    return _challengeToFieldElement(challenge);
  }

  function merkleRootToFieldElement(
    bytes32 merkleRoot
  ) public pure returns (uint256) {
    return _merkleRootToFieldElement(merkleRoot);
  }
}
