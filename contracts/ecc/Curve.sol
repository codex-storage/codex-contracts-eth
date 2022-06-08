// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <=0.8.13;

library Curve {
  struct G1Point {
    uint256 X;
    uint256 Y;
  }

  // Encoding of field elements is: X[0] * z + X[1]
  struct G2Point {
    uint256[2] X;
    uint256[2] Y;
  }
}