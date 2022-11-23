// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library Utils {
  using EnumerableSet for EnumerableSet.Bytes32Set;

  function _resize(bytes32[] memory array, uint8 newSize)
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

  function filter(
    EnumerableSet.Bytes32Set storage set,
    function(bytes32) internal view returns (bool) include
  ) internal view returns (bytes32[] memory result) {
    bytes32[] memory selected = new bytes32[](set.length());
    uint256 amount = 0;

    for (uint256 i = 0; i < set.length(); i++) {
      if (include(set.at(i))) {
        selected[amount++] = set.at(i);
      }
    }

    result = new bytes32[](amount);
    for (uint256 i = 0; i < result.length; i++) {
      result[i] = selected[i];
    }
  }
}
