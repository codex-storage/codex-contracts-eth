// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {

  function period(bytes32 id) public view returns (uint) {
    return _period(id);
  }

  function timeout(bytes32 id) public view returns (uint) {
    return _timeout(id);
  }

  function end(bytes32 id) public view returns (uint) {
    return _end(id);
  }

  function missed(bytes32 id) public view returns (uint) {
    return _missed(id);
  }

  function expectProofs(
    bytes32 id,
    uint _period,
    uint _timeout,
    uint _duration
  ) public {
    _expectProofs(id, _period, _timeout, _duration);
  }

  function isProofRequired(
    bytes32 id,
    uint blocknumber
  )
    public view
    returns (bool)
  {
    return _isProofRequired(id, blocknumber);
  }

  function submitProof(
    bytes32 id,
    uint blocknumber,
    bool proof
  )
    public
  {
    _submitProof(id, blocknumber, proof);
  }

  function markProofAsMissing(bytes32 id, uint blocknumber) public {
      _markProofAsMissing(id, blocknumber);
  }
}
