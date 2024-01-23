// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

struct G1Point {
  uint x;
  uint y;
}

struct G2Point {
  uint[2] x;
  uint[2] y;
}

struct Groth16Proof {
  G1Point a;
  G2Point b;
  G1Point c;
}
