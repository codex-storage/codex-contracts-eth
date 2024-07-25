// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./Configuration.sol";
import "./Requests.sol";
import "hardhat/console.sol";

/**
 * @title Validation
 * @notice Abstract contract that handles distribution of SlotIds to validators
   based on the number of validators specified in the config.
 */
abstract contract Validation {
  ValidationConfig private _config;
  uint256 private _idsPerValidator; // number of uint256's in each group of the 2^256 bit space

  /**
   * Creates a new Validation contract.
   * @param config network-level validator configuration used to determine
     number of SlotIds per validator.
   */
  constructor(ValidationConfig memory config) {
    require(config.validators > 0, "validators must be > 0");

    uint256 high = type(uint256).max;

    // To find the number of SlotIds per validator, we could do
    // 2^256/validators, except that would overflow. Instead, we use
    // floor(2^256-1 / validators) + 1. For example, if we used a 4-bit space
    // (2^4=16) with 2 validators, we'd expect 8 per group: floor(2^4-1 / 2) + 1
    // = 8
    if (config.validators == 1) {
      // max(uint256) + 1 would overflow, so assign 0 and handle as special case
      // later
      _idsPerValidator = 0;
    } else {
      _idsPerValidator = (high / config.validators) + 1;
    }

    _config = config;
  }

  /**
   * Determines which validator group (0-based index) a SlotId belongs to, based
     on the number of total validators in the config.
   * @param slotId SlotID for which to determine the validator group index.
   */
  function _getValidatorIndex(SlotId slotId) internal view returns (uint16) {
    uint256 slotIdInt = uint256(SlotId.unwrap(slotId));
    return uint16(slotIdInt / _idsPerValidator);
  }
}
