// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./Verifier.sol";

contract TestVerifier is IVerifier {
  bool private _proofsAreValid;

  constructor() {
    _proofsAreValid = true;
  }

  function setProofsAreValid(bool proofsAreValid) public {
    _proofsAreValid = proofsAreValid;
  }

  function verifyProof(
    uint[2] calldata,
    uint[2][2] calldata,
    uint[2] calldata,
    uint[] calldata
  ) external view returns (bool) {
    return _proofsAreValid;
  }
}
