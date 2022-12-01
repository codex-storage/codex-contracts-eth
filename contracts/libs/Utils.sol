// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

library Utils {
  function resize(bytes32[] memory array, uint256 newSize)
    internal
    pure
    returns (bytes32[] memory)
  {
    require(newSize <= array.length, "size out of bounds");

    if (newSize == 0) {
      bytes32[] memory empty;
      return empty;
    } else {
      bytes32[] memory sized = new bytes32[](newSize);
      for (uint8 i = 0; i < newSize; i++) {
        sized[i] = array[i];
      }
      return sized;
    }
  }
}
