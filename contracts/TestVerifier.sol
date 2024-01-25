// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./Groth16.sol";

contract TestVerifier is IGroth16Verifier {
  function verify(
    Groth16Proof calldata proof,
    uint[] calldata
  ) external pure returns (bool) {
    // accepts any proof, except the proof with all zero values
    return
      !(proof.a.x == 0 &&
        proof.a.y == 0 &&
        proof.b.x[0] == 0 &&
        proof.b.x[1] == 0 &&
        proof.b.y[0] == 0 &&
        proof.b.y[1] == 0 &&
        proof.c.x == 0 &&
        proof.c.y == 0);
  }
}
