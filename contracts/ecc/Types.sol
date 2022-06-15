// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <=0.8.13;

library Types {
  struct G1PointJac {
    uint256 x;
    uint256 y;
    uint256 z;
  }

  struct G1Point {
    uint256 x;
    uint256 y;
  }

  // Encoding of field elements is: X[0] * z + X[1]
  struct G2Point {
    uint256[2] x;
    uint256[2] y;
  }

  struct QElement {
    int64     i;
    uint256   v;
  }

  struct Proof {
    // TODO: should `q` be bounded?
    QElement[]    q;
    uint256[]   mus;
    // sigma is probably only the x coordinate
    // (https://github.com/supranational/blst#serialization-format)
    G1Point       sigma;
    // TODO: should `u` be bounded?
    G1Point[]     u;
    bytes         name;
    G2Point       publicKey;
  }
}