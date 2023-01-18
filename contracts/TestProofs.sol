// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {
  mapping(SlotId => SlotState) private states;

  // solhint-disable-next-line no-empty-blocks
  constructor(ProofConfig memory config) Proofs(config) {}

  function slotState(SlotId slotId) public view override returns (SlotState) {
    return states[slotId];
  }

  function startRequiringProofs(SlotId slot, uint256 _probability) public {
    _startRequiringProofs(slot, _probability);
  }

  function markProofAsMissing(SlotId id, Period _period) public {
    _markProofAsMissing(id, _period);
  }

  function setSlotState(SlotId id, SlotState state) public {
    states[id] = state;
  }
}
