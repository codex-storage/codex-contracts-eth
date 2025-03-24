// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Marketplace.sol";

// exposes internal functions of Marketplace for testing
contract TestMarketplace is Marketplace {
  using VaultHelpers for RequestId;
  using VaultHelpers for Vault;

  constructor(
    MarketplaceConfig memory config,
    Vault vault,
    IGroth16Verifier verifier
  ) Marketplace(config, vault, verifier) {}

  function forciblyFreeSlot(SlotId slotId) public {
    _forciblyFreeSlot(slotId);
  }

  function getSlotBalance(SlotId slotId) public view returns (uint256) {
    Slot storage slot = _slots[slotId];
    FundId fund = slot.requestId.asFundId();
    AccountId collateralAccount = vault().collateralAccount(
      slot.host,
      slot.slotIndex
    );
    AccountId rewardAccount = vault().rewardAccount(
      slot.rewardRecipient,
      slot.slotIndex
    );
    return
      vault().getBalance(fund, collateralAccount) +
      vault().getBalance(fund, rewardAccount);
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
