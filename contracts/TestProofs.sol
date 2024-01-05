// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {
  mapping(SlotId => SlotState) private _states;

  // solhint-disable-next-line no-empty-blocks
  constructor(ProofConfig memory config, address verifierAddress) Proofs(config, verifierAddress) {}

  function slotState(SlotId slotId) public view override returns (SlotState) {
    return _states[slotId];
  }

  function startRequiringProofs(SlotId slot, uint256 probability) public {
    _startRequiringProofs(slot, probability);
  }

  function markProofAsMissing(SlotId id, Period period) public {
    _markProofAsMissing(id, period);
  }

  function setSlotState(SlotId id, SlotState state) public {
    _states[id] = state;
  }
}
