// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Requests.sol";

contract SlotReservations {
  using EnumerableSet for EnumerableSet.AddressSet;

  mapping(SlotId => EnumerableSet.AddressSet) private _reservations;

  uint8 private constant _MAX_RESERVATIONS = 3;

  function reserveSlot(SlotId slotId, address host) public returns (bool) {
    require(canReserveSlot(slotId, host), "Reservation not allowed");
    // returns false if set already contains address
    return _reservations[slotId].add(host);
  }

  function canReserveSlot(
    SlotId slotId,
    address host
  ) public view returns (bool) {
    return
      // TODO: add in check for address inside of expanding window
      (_reservations[slotId].length() < _MAX_RESERVATIONS) &&
      (!_reservations[slotId].contains(host));
  }
}
