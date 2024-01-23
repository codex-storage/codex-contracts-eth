// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./Groth16.sol";

contract TestVerifier is IGroth16Verifier {
  bool private _proofsAreValid;

  constructor() {
    _proofsAreValid = true;
  }

  function setProofsAreValid(bool proofsAreValid) public {
    _proofsAreValid = proofsAreValid;
  }

  function verify(
    Groth16Proof calldata,
    uint[] calldata
  ) external view returns (bool) {
    return _proofsAreValid;
  }
}
