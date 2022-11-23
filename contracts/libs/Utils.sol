// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library Utils {
  using EnumerableSet for EnumerableSet.Bytes32Set;

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
