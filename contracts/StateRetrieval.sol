// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Requests.sol";

contract StateRetrieval {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using Requests for bytes32[];

  mapping(address => EnumerableSet.Bytes32Set) private requestsPerClient;
  mapping(address => EnumerableSet.Bytes32Set) private slotsPerHost;

  function myRequests() public view returns (RequestId[] memory) {
    return requestsPerClient[msg.sender].values().toRequestIds();
  }

  function mySlots() public view returns (SlotId[] memory) {
    return slotsPerHost[msg.sender].values().toSlotIds();
  }

  function _hasSlots(address host) internal view returns (bool) {
    return slotsPerHost[host].length() > 0;
  }

  function _addToMyRequests(address client, RequestId requestId) internal {
    requestsPerClient[client].add(RequestId.unwrap(requestId));
  }

  function _addToMySlots(address host, SlotId slotId) internal {
    slotsPerHost[host].add(SlotId.unwrap(slotId));
  }

  function _removeFromMyRequests(address client, RequestId requestId) internal {
    requestsPerClient[client].remove(RequestId.unwrap(requestId));
  }

  function _removeFromMySlots(address host, SlotId slotId) internal {
    slotsPerHost[host].remove(SlotId.unwrap(slotId));
  }
}
