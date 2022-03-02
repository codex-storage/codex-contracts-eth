// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {
  constructor(uint256 __period, uint256 __timeout)
    Proofs(__period, __timeout)
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

  function expectProofs(bytes32 id, uint256 _duration) public {
    _expectProofs(id, _duration);
  }

  function isProofRequired(bytes32 id, uint256 blocknumber)
    public
    view
    returns (bool)
  {
    return _isProofRequired(id, blocknumber);
  }

  function submitProof(
    bytes32 id,
    uint256 blocknumber,
    bool proof
  ) public {
    _submitProof(id, blocknumber, proof);
  }

  function markProofAsMissing(bytes32 id, uint256 blocknumber) public {
    _markProofAsMissing(id, blocknumber);
  }
}
