// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Validation.sol";
import "./Requests.sol";

contract TestValidation is Validation {
  constructor(ValidationConfig memory config) Validation(config) {} // solhint-disable-line no-empty-blocks

  function getValidatorIndex(SlotId slotId) public view returns (uint16) {
    return _getValidatorIndex(slotId);
  }
}
