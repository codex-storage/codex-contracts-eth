// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Requests.sol";
import "./Configuration.sol";

contract SlotReservations {
  using EnumerableSet for EnumerableSet.AddressSet;

  mapping(SlotId => EnumerableSet.AddressSet) internal _reservations;
  SlotReservationsConfig private _config;

  constructor(SlotReservationsConfig memory config) {
    _config = config;
  }

  function reserveSlot(RequestId requestId, uint256 slotIndex) public {
    require(canReserveSlot(requestId, slotIndex), "Reservation not allowed");

    SlotId slotId = Requests.slotId(requestId, slotIndex);
    _reservations[slotId].add(msg.sender);

    if (_reservations[slotId].length() == _MAX_RESERVATIONS) {
      emit SlotReservationsFull(slotId);
    }
  }

  function canReserveSlot(
    RequestId requestId,
    uint256 slotIndex
  ) public view returns (bool) {
    address host = msg.sender;
    SlotId slotId = Requests.slotId(requestId, slotIndex);
    return
      // TODO: add in check for address inside of expanding window
      (_reservations[slotId].length() < _config.maxReservations) &&
      (!_reservations[slotId].contains(host));
  }

  event SlotReservationsFull(SlotId indexed slotId);
}
