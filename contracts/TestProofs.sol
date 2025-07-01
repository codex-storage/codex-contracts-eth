// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {
  mapping(SlotId => SlotState) private _states;
  mapping(SlotId => uint256) private _probabilities;
  // A _config object exist in Proofs but it is private.
  // Better to duplicate this config in the test implementation
  // rather than modifiying the existing implementation and change
  // private to internal, which may cause problems in the Marketplace contract.
  ProofConfig private _proofConfig;

  function initialize (
    ProofConfig memory config,
    IGroth16Verifier verifier
  ) public initializer {
    _proofConfig = config;
    _initializeProofs(config, verifier);
  }

  function slotState(SlotId slotId) public view override returns (SlotState) {
    return _states[slotId];
  }

  function startRequiringProofs(SlotId slot) public {
    _startRequiringProofs(slot);
  }

  function markProofAsMissing(SlotId id, Period period) public {
    _markProofAsMissing(id, period);
  }

  function proofReceived(
    SlotId id,
    Groth16Proof calldata proof,
    uint[] memory pubSignals
  ) public {
    _proofReceived(id, proof, pubSignals);
  }

  function setSlotState(SlotId id, SlotState state) public {
    _states[id] = state;
  }

  function slotProbability(
    SlotId id
  ) public view virtual override returns (uint256) {
    return (_probabilities[id] * (256 - _proofConfig.downtime)) / 256;
  }

  function setSlotProbability(SlotId id, uint256 probability) public {
    _probabilities[id] = probability;
  }
}
