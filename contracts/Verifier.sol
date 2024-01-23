// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IVerifier {
  function verifyProof(
    uint[2] calldata pA,
    uint[2][2] calldata pB,
    uint[2] calldata pC,
    uint[3] calldata pubSignals
  ) external view returns (bool);
}
