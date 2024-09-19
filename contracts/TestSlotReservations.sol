// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./SlotReservations.sol";

contract TestSlotReservations is SlotReservations {
  using EnumerableSet for EnumerableSet.AddressSet;

  // solhint-disable-next-line no-empty-blocks
  constructor(SlotReservationsConfig memory config) SlotReservations(config) {}

  function contains(SlotId slotId, address host) public view returns (bool) {
    return _reservations[slotId].contains(host);
  }

  function length(SlotId slotId) public view returns (uint256) {
    return _reservations[slotId].length();
  }
}
