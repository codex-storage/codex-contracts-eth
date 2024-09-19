// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Configuration.sol";
import "./Requests.sol";

contract SlotReservations {
  using EnumerableSet for EnumerableSet.AddressSet;

  mapping(SlotId => EnumerableSet.AddressSet) internal _reservations;
  SlotReservationsConfig private _config;

  uint8 private constant _MAX_RESERVATIONS = 3;

  constructor(SlotReservationsConfig memory config) {
    require(config.saturation <= 100, "saturation must be [0, 100]");
    _config = config;
  }

  function reserveSlot(SlotId slotId) public {
    address host = msg.sender;
    require(canReserveSlot(slotId), "Reservation not allowed");
    _reservations[slotId].add(host);
  }

  function canReserveSlot(SlotId slotId) public view returns (bool) {
    address host = msg.sender;
    return
      // TODO: add in check for address inside of expanding window
      (_reservations[slotId].length() < _MAX_RESERVATIONS) &&
      (!_reservations[slotId].contains(host));
  }
}
