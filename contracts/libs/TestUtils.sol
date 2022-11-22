// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Utils.sol";

// exposes public functions for testing
contract TestUtils {

  function resize(bytes32[] memory array,
                  uint8 newSize)
    public
    pure
    returns (bytes32[] memory)
  {
    return Utils._resize(array, newSize);
  }
}
