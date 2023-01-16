// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {
  mapping(SlotId => SlotState) private states;

  constructor(
    uint256 __period,
    uint256 __timeout,
    uint8 __downtime
  )
    Proofs(__period, __timeout, __downtime)
  // solhint-disable-next-line no-empty-blocks
  {

  }

  function slotState(SlotId slotId) internal view override returns (SlotState) {
    return states[slotId];
  }

  function startRequiringProofs(SlotId slot, uint256 _probability) public {
    _startRequiringProofs(slot, _probability);
  }

  function isProofRequired(SlotId id) public view returns (bool) {
    return _isProofRequired(id);
  }

  function willProofBeRequired(SlotId id) public view returns (bool) {
    return _willProofBeRequired(id);
  }

  function getChallenge(SlotId id) public view returns (bytes32) {
    return _getChallenge(id);
  }

  function getPointer(SlotId id) public view returns (uint8) {
    return _getPointer(id);
  }

  function markProofAsMissing(SlotId id, Period _period) public {
    _markProofAsMissing(id, _period);
  }

  function setSlotState(SlotId id, SlotState state) public {
    states[id] = state;
  }
}
