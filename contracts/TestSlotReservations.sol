// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./SlotReservations.sol";

contract TestSlotReservations is SlotReservations {
  using EnumerableSet for EnumerableSet.AddressSet;

  mapping(SlotId => SlotState) private _states;

  function initialize (
    SlotReservationsConfig memory config
  ) public initializer {
    _initializeSlotReservations(config);
  }
  function contains(SlotId slotId, address host) public view returns (bool) {
    return _reservations[slotId].contains(host);
  }

  function length(SlotId slotId) public view returns (uint256) {
    return _reservations[slotId].length();
  }

  function slotState(SlotId slotId) public view override returns (SlotState) {
    return _states[slotId];
  }

  function setSlotState(SlotId id, SlotState state) public {
    _states[id] = state;
  }
}
