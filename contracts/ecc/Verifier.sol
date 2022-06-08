// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <=0.8.13;

import "./Curve.sol";

library Verifier {
  struct QElement {
    int64     i;
    uint256   v;
  }

  struct Proof {
    // TODO: should `q` be bounded?
    QElement[]        q;
    uint256[10]       mus;
    // sigma is probably only the x coordinate
    // (https://github.com/supranational/blst#serialization-format)
    Curve.G1Point     sigma;
    // TODO: should `u` be bounded?
    Curve.G1Point[]   u;
    bytes             name;
    Curve.G2Point     publicKey;
  }
}