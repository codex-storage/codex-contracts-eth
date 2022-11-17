// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract ActiveSlots {
  mapping(bytes32 =>
          mapping(address =>
                  mapping(uint8 =>
                          EnumerableSet.Bytes32Set))) private activeSlots;
  mapping(bytes32 => uint8) private activeSlotsIdx;

  function _activeSlotsForHost(address host, bytes32 requestId)
    internal
    view
    returns (EnumerableSet.Bytes32Set storage)
  {
    uint8 id = activeSlotsIdx[requestId];
    return activeSlots[requestId][host][id];
  }

  /// @notice Clears active slots for a request
  /// @dev Because there are no efficient ways to clear an EnumerableSet, an index is updated that points to a new instance.
  /// @param requestId request for which to clear the active slots
  function _clearActiveSlots(bytes32 requestId) internal {
    activeSlotsIdx[requestId]++;
  }
}