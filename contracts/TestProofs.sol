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

  function end(bytes32 id) public view returns (uint256) {
    return _end(id);
  }

  function missed(bytes32 id) public view returns (uint256) {
    return _missed(id);
  }

  function expectProofs(
    bytes32 id,
    uint256 _probability,
    uint256 _duration
  ) public {
    _expectProofs(id, _probability, _duration);
  }

  function isProofRequired(bytes32 id) public view returns (bool) {
    return _isProofRequired(id);
  }

  function willProofBeRequired(bytes32 id) public view returns (bool) {
    return _willProofBeRequired(id);
  }

  function getChallenge(bytes32 id) public view returns (bytes32) {
    return _getChallenge(id);
  }

  function getPointer(bytes32 id) public view returns (uint8) {
    return _getPointer(id);
  }

  function submitProof(bytes32 id, Types.Proof calldata proof) public {
    _submitProof(id, proof);
  }

  function markProofAsMissing(bytes32 id, uint256 _period) public {
    _markProofAsMissing(id, _period);
  }
}
