// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "./Verifier.sol";

contract TestVerifier is IVerifier {
  function verifyProof(
    uint[2] calldata,
    uint[2][2] calldata,
    uint[2] calldata,
    uint[3] calldata
  ) external pure returns (bool) {
    return false;
  }
}
