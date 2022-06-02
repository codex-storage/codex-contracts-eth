// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ecc/verifiers/Bn254Verifier.sol";
import "./ecc/Verifier.sol";

// exposes internal functions of Proofs for testing
contract TestBn254Verifier {
  using Bn254Verifier for Verifier.Proof;
  function verifyProof(Verifier.Proof memory p) public view returns (bool) {
    // Proof memory p;
    // p.q = [
    //   Curve.QElement(i, v),
    //   Curve.QElement(i, v),
    //   Curve.QElement(i, v)
    // ];
    // p.mus = [];
    // p.sigma = Curve.G1Point(x, y);
    // p.u = [
    //   Curve.G1Point(x, y),
    //   Curve.G1Point(x, y),
    //   Curve.G1Point(x, y)
    // ];
    // p.publicKey = Curve.G2Point(
    //   [
    //     11559732032986387107991004021392285783925812861821192530917403151452391805634,
    //     10857046999023057135944570762232829481370756359578518086990519993285655852781
    //   ],
    //   [
    //     4082367875863433681332203403145435568316851327593401208105741076214120093531,
    //     8495653923123431417604973247489272438418190587263600148770280649306958101930
    //   ]
    return p._verifyProof();
  }
}
