// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {
  constructor(
    uint256 __period,
    uint256 __timeout,
    uint8 __downtime
  )
    Proofs(__period, __timeout, __downtime)
  // solhint-disable-next-line no-empty-blocks
  {

  }

  function period() public view returns (uint256) {
    return _period();
  }

  function timeout() public view returns (uint256) {
    return _timeout();
  }

  function end(RequestId id) public view returns (uint256) {
    return _end(id);
  }

  function expectProofs(
    SlotId slot,
    RequestId request,
    uint256 _probability
  ) public {
    _expectProofs(slot, request, _probability);
  }

  function unexpectProofs(SlotId id) public {
    _unexpectProofs(id);
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

  function submitProof(SlotId id, bytes calldata proof) public {
    _submitProof(id, proof);
  }

  function markProofAsMissing(SlotId id, uint256 _period) public {
    _markProofAsMissing(id, _period);
  }

  function setProofEnd(RequestId id, uint256 ending) public {
    _setProofEnd(id, ending);
  }
}
